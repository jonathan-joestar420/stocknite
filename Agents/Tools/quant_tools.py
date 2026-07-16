"""
Skill A: CFA Financial Quant Analytics -- tools implementing the formulas
from the spec doc's section 2 ("底層量化金融數學模型與公式").

Uses numpy for vector/matrix math (covariance matrix, portfolio volatility,
MCTR) and scipy.optimize for the constrained Sharpe-ratio maximization in
formula 6. All tools return plain JSON-serializable dicts.

Time anchor: all historical data is 2025 full year, ending at the demo
"today" of 2025/12/31 (see data_loader.DEMO_TODAY).
"""

import numpy as np
import pandas as pd
from scipy.optimize import minimize

try:
    from .data_loader import (
        get_annual_cash_dividend,
        get_closing_price_series,
        load_wide_summary,
        stock_exists,
    )
except ImportError:
    from data_loader import (
        get_annual_cash_dividend,
        get_closing_price_series,
        load_wide_summary,
        stock_exists,
    )

# Default risk-free rate used in the Sharpe ratio (formula 6). No
# risk-free instrument exists in the demo dataset, so this approximates
# a Taiwan 1-year time deposit rate. Callers can override it.
DEFAULT_RISK_FREE_RATE = 0.015

# Correlation threshold above which two holdings are flagged "crowded",
# per the spec doc's formula 5.
CROWDING_THRESHOLD = 0.8

TRADING_DAYS_PER_YEAR = 252


def _daily_returns(stock_code: str) -> np.ndarray:
    """Daily simple returns (not annualized) for one stock, computed from
    its 2025 closing price series.
    """
    series = get_closing_price_series(stock_code)
    prices = np.array([p for _, p in series], dtype=float)
    if len(prices) < 2:
        return np.array([])
    return prices[1:] / prices[:-1] - 1.0


def _validate_codes(stock_codes: list[str]) -> str | None:
    """Return an error message if any code is outside the 300-stock demo
    universe, else None.
    """
    bad = [c for c in stock_codes if not stock_exists(c)]
    if bad:
        return f"以下股票代號不在示範的 300 檔清單內：{', '.join(bad)}"
    return None


def _validate_holdings_shape(holdings: object) -> str | None:
    """Return an error message if `holdings` isn't shaped like
    [{"stock_code": str, "weight": number}, ...], else None. Tool
    arguments come from the model, which can occasionally pass the wrong
    shape (e.g. a plain list of stock code strings instead of dicts with
    a weight) -- validating explicitly here means callers get back a
    clean {"error": ...} they can react to and retry, instead of an
    unhandled TypeError/KeyError crashing the whole agent turn.
    """
    if not isinstance(holdings, list):
        return f"holdings 必須是一個清單，收到的是：{type(holdings).__name__}。"
    for i, h in enumerate(holdings):
        if not isinstance(h, dict):
            return (
                f"holdings 第 {i + 1} 筆格式錯誤：每一筆必須是包含 "
                '"stock_code" 與 "weight" 的物件，例如 '
                '{"stock_code": "2330", "weight": 0.6}，'
                f"收到的是：{type(h).__name__}。"
            )
        if "stock_code" not in h or not isinstance(h.get("stock_code"), str):
            return f"holdings 第 {i + 1} 筆缺少有效的 stock_code（字串）。"
        if "weight" not in h:
            return f"holdings 第 {i + 1} 筆缺少 weight。"
        try:
            float(h["weight"])
        except (TypeError, ValueError):
            return f"holdings 第 {i + 1} 筆的 weight 不是有效數字：{h.get('weight')!r}。"
    return None


def compute_portfolio_weights(positions: list[dict]) -> dict:
    """Compute market value and portfolio weight for a list of positions
    (stock_code + quantity, and optionally a market_value already known
    from get_holdings), using each stock's current closing price from the
    demo dataset. This does the price-lookup and division arithmetic in
    Python so it's exact -- use this INSTEAD OF calculating weights
    yourself in your own reasoning, especially when merging real holdings
    with a hypothetical new position (e.g. "what if I also buy 500 more
    shares of X"), since manual arithmetic across several steps is where
    mistakes creep in silently and feed a wrong number into
    get_portfolio_metrics/get_risk_contribution.

    Args:
        positions: List of dicts, one per stock, each with:
            - stock_code: Taiwan stock code, e.g. "2330".
            - quantity: Number of shares (not board lots).
            - market_value: Optional. If you already have a live market
              value for this position (e.g. from get_holdings's
              market_value field), pass it here and it will be used
              as-is instead of recomputing from quantity * close_price
              (get_holdings' value may differ slightly if the backend
              uses a different price snapshot). Omit to compute purely
              from quantity and this dataset's close price.

    Returns:
        A dict with "positions": a list of
        {stock_code, quantity, market_value, weight} for each input,
        weight being market_value / total_market_value across all
        positions (decimal, sums to ~1.0), plus "total_market_value".
        This output's "positions" list (after stripping down to just
        stock_code/weight per item) is exactly the shape
        get_portfolio_metrics/get_risk_contribution expect for their
        holdings argument. Returns {"error": ...} if any stock code is
        invalid, fewer than 1 position given, or total market value is
        <= 0.
    """
    if not isinstance(positions, list) or not positions:
        return {"error": "positions 必須是至少包含 1 筆的清單。"}

    codes = []
    for i, p in enumerate(positions):
        if not isinstance(p, dict) or not isinstance(p.get("stock_code"), str):
            return {"error": f"positions 第 {i + 1} 筆缺少有效的 stock_code。"}
        codes.append(p["stock_code"])

    err = _validate_codes(codes)
    if err:
        return {"error": err}

    summary = load_wide_summary()
    resolved = []
    for i, p in enumerate(positions):
        code = p["stock_code"]
        if p.get("market_value") is not None:
            try:
                market_value = float(p["market_value"])
            except (TypeError, ValueError):
                return {"error": f"positions 第 {i + 1} 筆的 market_value 不是有效數字。"}
        else:
            quantity = p.get("quantity")
            if quantity is None:
                return {
                    "error": (
                        f"positions 第 {i + 1} 筆缺少 quantity（若已知"
                        "market_value 可直接提供該欄位代替）。"
                    )
                }
            try:
                quantity = float(quantity)
            except (TypeError, ValueError):
                return {"error": f"positions 第 {i + 1} 筆的 quantity 不是有效數字。"}
            close_price = summary.loc[code, "收盤價"]
            if pd.isna(close_price):
                return {"error": f"股票代號 {code} 目前沒有可用的收盤價資料。"}
            market_value = quantity * float(close_price)
        resolved.append({"stock_code": code, "quantity": p.get("quantity"), "market_value": market_value})

    total = sum(r["market_value"] for r in resolved)
    if total <= 0:
        return {"error": "所有 positions 的市值總和必須大於 0。"}

    for r in resolved:
        r["weight"] = round(r["market_value"] / total, 6)
        r["market_value"] = round(r["market_value"], 2)

    return {"positions": resolved, "total_market_value": round(total, 2)}


def get_historical_return(stock_code: str) -> dict:
    """Calculate the historical period return for one stock over 2025,
    per formula (1): R = (P_end - P_start + D) / P_start.

    Args:
        stock_code: Taiwan stock code, e.g. "2330". Must be one of the 300
            demo stocks.

    Returns:
        A dict with P_start (期初價格), P_end (期末價格), D (年度現金股利
        總和), and R_period (歷史累計報酬率, as a decimal e.g. 0.28 = 28%).
        Returns {"error": ...} if the stock code is invalid or has fewer
        than 2 price observations.
    """
    err = _validate_codes([stock_code])
    if err:
        return {"error": err}

    series = get_closing_price_series(stock_code)
    if len(series) < 2:
        return {"error": f"股票代號 {stock_code} 的價格資料不足，無法計算報酬率。"}

    p_start = series[0][1]
    p_end = series[-1][1]
    dividend = get_annual_cash_dividend(stock_code)
    r_period = (p_end - p_start + dividend) / p_start

    return {
        "股票代號": stock_code,
        "期初價格": round(p_start, 2),
        "期末價格": round(p_end, 2),
        "年度現金股利": round(dividend, 2),
        "歷史累計報酬率": round(float(r_period), 4),
    }


def get_portfolio_metrics(holdings: list[dict]) -> dict:
    """Calculate portfolio expected return and volatility for a set of
    holdings, per formulas (2) and (3):
        E(Rp) = sum(w_i * E(R_i))
        sigma_p = sqrt(w^T * Sigma * w)

    Individual stock expected returns E(R_i) are taken as each stock's
    2025 historical period return (formula 1). The covariance matrix
    Sigma is computed from daily returns across the full 2025 series.

    Args:
        holdings: List of dicts like [{"stock_code": "2330", "weight": 0.6},
            {"stock_code": "2603", "weight": 0.4}]. Weights should sum to
            1.0 (will be normalized if they don't).

    Returns:
        A dict with 組合預期報酬率 (E(Rp)), 組合波動度 (sigma_p, annualized),
        and per-stock 個股預期報酬率. Returns {"error": ...} if any stock
        code is invalid or there are fewer than 2 holdings.
    """
    shape_err = _validate_holdings_shape(holdings)
    if shape_err:
        return {"error": shape_err}
    if len(holdings) < 2:
        return {"error": "投資組合分析需要至少 2 檔股票。"}

    codes = [h["stock_code"] for h in holdings]
    err = _validate_codes(codes)
    if err:
        return {"error": err}

    weights = np.array([float(h["weight"]) for h in holdings])
    if weights.sum() <= 0:
        return {"error": "持股權重總和必須大於 0。"}
    weights = weights / weights.sum()

    # Per-stock expected return, from historical period return.
    expected_returns = []
    for code in codes:
        r = get_historical_return(code)
        if "error" in r:
            return r
        expected_returns.append(r["歷史累計報酬率"])
    expected_returns = np.array(expected_returns)

    # Daily return series per stock, aligned by trimming to the shortest
    # common length (handles stocks with slightly different trading-day
    # counts, e.g. new listings).
    return_series = [_daily_returns(code) for code in codes]
    min_len = min(len(r) for r in return_series)
    if min_len < 2:
        return {"error": "部分股票的價格資料不足，無法計算共變異數矩陣。"}
    aligned = np.array([r[-min_len:] for r in return_series])

    # Annualized covariance matrix from daily returns.
    cov_matrix = np.cov(aligned) * TRADING_DAYS_PER_YEAR
    if cov_matrix.ndim == 0:
        cov_matrix = cov_matrix.reshape(1, 1)

    portfolio_return = float(weights @ expected_returns)
    portfolio_variance = float(weights @ cov_matrix @ weights)
    portfolio_volatility = float(np.sqrt(max(portfolio_variance, 0.0)))

    return {
        "持股權重": {code: round(float(w), 4) for code, w in zip(codes, weights)},
        "個股預期報酬率": {
            code: round(float(r), 4) for code, r in zip(codes, expected_returns)
        },
        "組合預期報酬率": round(portfolio_return, 4),
        "組合波動度": round(portfolio_volatility, 4),
    }


def get_risk_contribution(holdings: list[dict]) -> dict:
    """Calculate marginal contribution to risk (MCTR) and risk
    contribution (RC) per stock, per formula (4):
        MCTR_i = (Sigma @ w)_i / sigma_p
        RC_i = w_i * MCTR_i

    Diagnoses whether any single stock's holding is disproportionately
    driving overall portfolio volatility.

    Args:
        holdings: List of dicts like [{"stock_code": "2330", "weight": 0.6},
            {"stock_code": "2603", "weight": 0.4}]. Weights should sum to
            1.0 (will be normalized if they don't).

    Returns:
        A dict with per-stock MCTR (邊際風險貢獻度) and risk contribution
        percentage (風險貢獻比例, RC_i / sigma_p as a % of total risk),
        plus 組合波動度 for reference. Returns {"error": ...} on invalid
        input, mirroring get_portfolio_metrics.
    """
    shape_err = _validate_holdings_shape(holdings)
    if shape_err:
        return {"error": shape_err}
    if len(holdings) < 2:
        return {"error": "風險貢獻分析需要至少 2 檔股票。"}

    codes = [h["stock_code"] for h in holdings]
    err = _validate_codes(codes)
    if err:
        return {"error": err}

    weights = np.array([float(h["weight"]) for h in holdings])
    if weights.sum() <= 0:
        return {"error": "持股權重總和必須大於 0。"}
    weights = weights / weights.sum()

    return_series = [_daily_returns(code) for code in codes]
    min_len = min(len(r) for r in return_series)
    if min_len < 2:
        return {"error": "部分股票的價格資料不足，無法計算風險貢獻度。"}
    aligned = np.array([r[-min_len:] for r in return_series])

    cov_matrix = np.cov(aligned) * TRADING_DAYS_PER_YEAR
    if cov_matrix.ndim == 0:
        cov_matrix = cov_matrix.reshape(1, 1)

    portfolio_variance = float(weights @ cov_matrix @ weights)
    portfolio_volatility = float(np.sqrt(max(portfolio_variance, 0.0)))

    if portfolio_volatility == 0:
        return {"error": "組合波動度為 0，無法計算風險貢獻度。"}

    mctr = (cov_matrix @ weights) / portfolio_volatility
    risk_contribution = weights * mctr
    risk_contribution_pct = risk_contribution / portfolio_volatility

    return {
        "組合波動度": round(portfolio_volatility, 4),
        "個股風險貢獻": {
            code: {
                "權重": round(float(w), 4),
                "邊際風險貢獻度(MCTR)": round(float(m), 4),
                "風險貢獻比例": round(float(rc), 4),
            }
            for code, w, m, rc in zip(
                codes, weights, mctr, risk_contribution_pct
            )
        },
    }


def get_correlation(stock_code_a: str, stock_code_b: str) -> dict:
    """Calculate the pairwise correlation coefficient between two stocks'
    daily returns, per formula (5): rho_ij = sigma_ij / (sigma_i * sigma_j).

    Flags "high crowding" if correlation exceeds 0.8, per the spec doc.

    Args:
        stock_code_a: First Taiwan stock code, e.g. "2330".
        stock_code_b: Second Taiwan stock code, e.g. "2454".

    Returns:
        A dict with 相關係数 (correlation, -1 to 1) and 擁擠度警告 (a
        boolean flag, true if correlation > 0.8). Returns {"error": ...}
        if either code is invalid or has insufficient price data.
    """
    err = _validate_codes([stock_code_a, stock_code_b])
    if err:
        return {"error": err}

    r_a = _daily_returns(stock_code_a)
    r_b = _daily_returns(stock_code_b)
    min_len = min(len(r_a), len(r_b))
    if min_len < 2:
        return {"error": "價格資料不足，無法計算相關係數。"}

    r_a, r_b = r_a[-min_len:], r_b[-min_len:]
    correlation = float(np.corrcoef(r_a, r_b)[0, 1])

    return {
        "股票代號_A": stock_code_a,
        "股票代號_B": stock_code_b,
        "相關係數": round(correlation, 4),
        "擁擠度警告": correlation > CROWDING_THRESHOLD,
    }


def optimize_portfolio_sharpe(
    stock_codes: list[str], risk_free_rate: float = DEFAULT_RISK_FREE_RATE
) -> dict:
    """Find the portfolio weights that maximize the Sharpe ratio, per
    formula (6) -- the Markowitz mean-variance optimization:
        max_w  SR = (w^T mu - Rf) / sqrt(w^T Sigma w)
        s.t.   sum(w_i) = 1, w_i >= 0  (long-only)

    Args:
        stock_codes: List of Taiwan stock codes to consider for the
            optimized portfolio, e.g. ["2330", "2603", "2454"]. Must
            contain at least 2 codes, all within the 300-stock demo set.
        risk_free_rate: Annual risk-free rate used in the Sharpe ratio
            (default 0.015, approximating a TW 1-year deposit rate).

    Returns:
        A dict with the mathematically optimal 模型計算權重 per stock (the
        weights that maximize the Sharpe ratio under this model -- a
        quantitative calculation result, NOT a recommendation to act on),
        the resulting 組合預期報酬率, 組合波動度, and 夏普比率. Returns
        {"error": ...} if optimization fails or inputs are invalid.

        IMPORTANT for callers: this tool has no investment advisory
        license. When presenting 模型計算權重 to the user, frame it
        explicitly as "what a math model calculates from historical data"
        -- not as "what you should do." Never phrase it as a specific
        buy/sell instruction, a target allocation to adopt, or a
        recommendation.
    """
    if len(stock_codes) < 2:
        return {"error": "投資組合優化需要至少 2 檔股票。"}

    err = _validate_codes(stock_codes)
    if err:
        return {"error": err}

    expected_returns = []
    for code in stock_codes:
        r = get_historical_return(code)
        if "error" in r:
            return r
        expected_returns.append(r["歷史累計報酬率"])
    expected_returns = np.array(expected_returns)

    return_series = [_daily_returns(code) for code in stock_codes]
    min_len = min(len(r) for r in return_series)
    if min_len < 2:
        return {"error": "部分股票的價格資料不足，無法執行優化。"}
    aligned = np.array([r[-min_len:] for r in return_series])
    cov_matrix = np.cov(aligned) * TRADING_DAYS_PER_YEAR
    if cov_matrix.ndim == 0:
        cov_matrix = cov_matrix.reshape(1, 1)

    n = len(stock_codes)

    def neg_sharpe(w):
        port_return = w @ expected_returns
        port_vol = np.sqrt(max(w @ cov_matrix @ w, 1e-12))
        return -(port_return - risk_free_rate) / port_vol

    constraints = ({"type": "eq", "fun": lambda w: np.sum(w) - 1.0},)
    bounds = [(0.0, 1.0)] * n
    initial_guess = np.array([1.0 / n] * n)

    result = minimize(
        neg_sharpe,
        initial_guess,
        method="SLSQP",
        bounds=bounds,
        constraints=constraints,
    )

    if not result.success:
        return {"error": f"優化計算失敗：{result.message}"}

    weights = result.x
    portfolio_return = float(weights @ expected_returns)
    portfolio_volatility = float(np.sqrt(max(weights @ cov_matrix @ weights, 0.0)))
    sharpe_ratio = (
        (portfolio_return - risk_free_rate) / portfolio_volatility
        if portfolio_volatility > 0
        else 0.0
    )

    return {
        "模型計算權重": {
            code: round(float(w), 4) for code, w in zip(stock_codes, weights)
        },
        "組合預期報酬率": round(portfolio_return, 4),
        "組合波動度": round(portfolio_volatility, 4),
        "夏普比率": round(float(sharpe_ratio), 4),
        "無風險利率": risk_free_rate,
    }
