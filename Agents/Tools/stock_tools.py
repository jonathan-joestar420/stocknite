"""
Plain Python functions exposed to the ADK agent as tools.

ADK auto-generates tool schemas from function signatures and docstrings, so
keep both accurate and descriptive -- the model relies on them to decide
when and how to call each tool.

All functions return plain dicts (JSON-serializable) with a consistent
"error" key on failure, since ADK tools should never raise -- a raised
exception just breaks the agent turn instead of letting the model recover.
"""

import pandas as pd

try:
    from .data_loader import (
        DEMO_TODAY,
        load_dividend_rankings,
        load_forum_stats,
        load_institutional_trading,
        load_momentum,
        load_return_rates,
        load_wide_summary,
        stock_exists,
    )
except ImportError:
    from data_loader import (
        DEMO_TODAY,
        load_dividend_rankings,
        load_forum_stats,
        load_institutional_trading,
        load_momentum,
        load_return_rates,
        load_wide_summary,
        stock_exists,
    )


def get_stock_snapshot(stock_code: str) -> dict:
    """Get a snapshot of a single stock: price, valuation, returns, dividend,
    and forum attention -- as of the demo "today" (2025/12/31).

    Args:
        stock_code: Taiwan stock code, e.g. "2330" for TSMC or "0050" for
            Yuanta Taiwan 50 ETF. Must be one of the 300 demo stocks.

    Returns:
        A dict with fields like 收盤價 (close price), 本益比 (P/E),
        股價淨值比 (P/B), 殖利率 (dividend yield), 年報酬率 (1yr return),
        買點分位 (percentile within this year's high/low range), 產業
        (industry), and 同學會瀏覽次數 (forum page views). Returns
        {"error": ...} if the stock code is not in the 300-stock demo set.
    """
    if not stock_exists(stock_code):
        return {
            "error": (
                f"股票代號 {stock_code} 不在示範的 300 檔清單內，"
                "無法提供資料。"
            )
        }

    row = load_wide_summary().loc[stock_code]
    return row.where(row.notna(), None).to_dict()


def get_forum_sentiment(stock_code: str, days: int = 30) -> dict:
    """Get aggregated retail-investor forum (股市同學會) sentiment for a
    stock over a trailing window of days, ending at the demo "today"
    (2025/12/31).

    Args:
        stock_code: Taiwan stock code, e.g. "2330". Must be one of the 300
            demo stocks.
        days: Number of trailing calendar days to aggregate over (default
            30). Use a smaller window (e.g. 7) for "this week" style
            questions.

    Returns:
        A dict with total post counts (發文則數), bullish/bearish/neutral
        post counts (看多發文/看空發文/中性發文), reply counts (回文則數),
        and a computed bullish ratio (看多比例 = 看多發文 / 總立場發文數).
        Returns {"error": ...} if the stock code is not in the 300-stock
        demo set.
    """
    if not stock_exists(stock_code):
        return {
            "error": (
                f"股票代號 {stock_code} 不在示範的 300 檔清單內，"
                "無法提供資料。"
            )
        }

    df = load_forum_stats()
    window_start = DEMO_TODAY - pd.Timedelta(days=days - 1)
    mask = (
        (df["股票代號"] == stock_code)
        & (df["日期"] >= window_start)
        & (df["日期"] <= DEMO_TODAY)
    )
    subset = df.loc[mask]

    if subset.empty:
        return {
            "error": (
                f"股票代號 {stock_code} 在最近 {days} 天內沒有同學會發文資料。"
            )
        }

    total_posts = int(subset["發文則數"].sum())
    bullish = int(subset["看多發文"].sum())
    bearish = int(subset["看空發文"].sum())
    neutral = int(subset["中性發文"].sum())
    stance_total = bullish + bearish + neutral

    return {
        "股票代號": stock_code,
        "統計天數": days,
        "發文則數": total_posts,
        "發文人數": int(subset["發文人數"].sum()),
        "看多發文": bullish,
        "看空發文": bearish,
        "中性發文": neutral,
        "看多比例": round(bullish / stance_total, 3) if stance_total else None,
        "看空比例": round(bearish / stance_total, 3) if stance_total else None,
        "回文則數": int(subset["回文則數"].sum()),
        "回文人數": int(subset["回文人數"].sum()),
    }


def get_institutional_trend(stock_code: str, days: int = 20) -> dict:
    """Get institutional investor (三大法人: foreign/investment trust/dealer)
    net buy/sell trend for a stock over a trailing window of days, ending
    at the demo "today" (2025/12/31).

    Args:
        stock_code: Taiwan stock code, e.g. "2330". Must be one of the 300
            demo stocks.
        days: Number of trailing calendar days to aggregate over (default
            20, matching the "近20日法人買賣超" convention used elsewhere
            in this dataset).

    Returns:
        A dict with summed net buy/sell (張, in thousands of shares) for
        foreign investors (外資買賣超), investment trusts (投信買賣超),
        dealers (自營商買賣超), and the combined total (買賣超合計), plus
        the latest foreign/institutional shareholding ratios. Returns
        {"error": ...} if the stock code is not in the 300-stock demo set.
    """
    if not stock_exists(stock_code):
        return {
            "error": (
                f"股票代號 {stock_code} 不在示範的 300 檔清單內，"
                "無法提供資料。"
            )
        }

    df = load_institutional_trading()
    window_start = DEMO_TODAY - pd.Timedelta(days=days - 1)
    mask = (
        (df["股票代號"] == stock_code)
        & (df["日期"] >= window_start)
        & (df["日期"] <= DEMO_TODAY)
    )
    subset = df.loc[mask].sort_values("日期")

    if subset.empty:
        return {
            "error": (
                f"股票代號 {stock_code} 在最近 {days} 天內沒有法人買賣超資料。"
            )
        }

    latest = subset.iloc[-1]

    return {
        "股票代號": stock_code,
        "統計天數": days,
        "外資買賣超合計": round(float(subset["外資買賣超"].sum()), 2),
        "投信買賣超合計": round(float(subset["投信買賣超"].sum()), 2),
        "自營商買賣超合計": round(float(subset["自營商買賣超"].sum()), 2),
        "三大法人買賣超合計": round(float(subset["買賣超合計"].sum()), 2),
        "最新外資持股比率(%)": (
            None if pd.isna(latest["外資持股比率(%)"])
            else round(float(latest["外資持股比率(%)"]), 2)
        ),
    }



def get_momentum_indicators(stock_code: str) -> dict:
    """Get short/medium-term price momentum for a stock, as of the demo
    "today" (2025/12/31): multi-window return rates and moving-average
    bias/streak indicators. Use this for "is this stock overheated /
    oversold right now" or "how has it been moving lately" style
    questions -- it's more granular than get_stock_snapshot's single
    year-to-date % and year-line bias.

    Not available for ETFs (see get_dividend_ranking's note on the
    266-stock vs 300-stock coverage gap) -- returns an error explaining
    that if called on an ETF code.

    Args:
        stock_code: Taiwan stock code, e.g. "2330". Must be one of the
            300 demo stocks.

    Returns:
        A dict with 日/週/月/季/半年/年報酬率 (return rates over each
        window), 與大盤比年報酬率 (excess return vs. the market index),
        近5/20/60日漲跌幅 (short-term price change %), 股價乖離月線/
        季線/年線 (moving-average bias %, positive = trading above that
        average), 股價創歷史新高 (1 if today is an all-time high),
        股價創N日新高 (N = how many trading days since the last new
        high, negative means N days ago), and 股價連N日漲 (consecutive
        up-days streak, negative means a down-days streak). Returns
        {"error": ...} if the stock code is invalid or has no momentum
        data (e.g. it's an ETF).
    """
    if not stock_exists(stock_code):
        return {
            "error": (
                f"股票代號 {stock_code} 不在示範的 300 檔清單內，"
                "無法提供資料。"
            )
        }

    returns_df = load_return_rates()
    returns_row = returns_df.loc[
        (returns_df["股票代號"] == stock_code) & (returns_df["日期"] == DEMO_TODAY)
    ]

    momentum_df = load_momentum()
    momentum_row = momentum_df.loc[
        (momentum_df["股票代號"] == stock_code) & (momentum_df["日期"] == DEMO_TODAY)
    ]
    if momentum_row.empty:
        return {
            "error": (
                f"股票代號 {stock_code} 沒有動能指標資料（通常表示這是 "
                "ETF，本項資料僅涵蓋個股，不含 ETF）。"
            )
        }

    def _num(v, digits=2):
        return None if pd.isna(v) else round(float(v), digits)

    def _count(v):
        return None if pd.isna(v) else int(v)

    result: dict = {"股票代號": stock_code}
    if not returns_row.empty:
        r = returns_row.iloc[0]
        result.update({
            "日報酬率(%)": _num(r["日報酬率(%)"]),
            "週報酬率(%)": _num(r["週報酬率(%)"]),
            "月報酬率(%)": _num(r["月報酬率(%)"]),
            "季報酬率(%)": _num(r["季報酬率(%)"]),
            "半年報酬率(%)": _num(r["半年報酬率(%)"]),
            "年報酬率(%)": _num(r["年報酬率(%)"]),
            "與大盤比年報酬率(%)": _num(r["與大盤比年報酬率(%)"]),
        })

    m = momentum_row.iloc[0]
    result.update({
        "近5日漲跌幅(%)": _num(m["近5日漲跌幅%"]),
        "近20日漲跌幅(%)": _num(m["近20日漲跌幅%"]),
        "近60日漲跌幅(%)": _num(m["近60日漲跌幅%"]),
        "股價乖離月線(%)": _num(m["股價乖離月線(%)"]),
        "股價乖離季線(%)": _num(m["股價乖離季線(%)"]),
        "股價乖離年線(%)": _num(m["股價乖離年線(%)"]),
        "股價創歷史新高": _count(m["股價創歷史新高"]),
        "股價創N日新高": _count(m["股價創N日新高"]),
        "股價連N日漲": _count(m["股價連N日漲"]),
    })
    return result


def get_dividend_ranking(stock_code: str) -> dict:
    """Get a stock's dividend growth trend and its ranking percentile
    among the 300-stock demo universe, as of 2025. Use this for "is this
    a good dividend stock" or "how does its dividend rank" style
    questions -- it's more specific than get_stock_snapshot's raw
    connective-years count, since it adds the growth trend (rising,
    falling, or flat) and where it stands relative to the other 299
    stocks/ETFs.

    Works for both individual stocks and ETFs (unlike
    get_momentum_indicators, which is stocks-only) -- source table is
    picked automatically based on which list the code appears in.

    Args:
        stock_code: Taiwan stock code, e.g. "2330" or an ETF code like
            "0056". Must be one of the 300 demo stocks/ETFs.

    Returns:
        A dict with 現金股利連N年遞增 (consecutive years of dividend-per-
        share growth; 0 = flat, negative = N consecutive years of
        decline), 連續N年發放現金股利 (consecutive years of paying any
        cash dividend; negative = N consecutive years of NOT paying),
        現金股利排名 (rank by total dividend amount, 1 = highest, among
        the demo universe), and 現金股利殖利率排名 (rank by dividend
        yield %). Lower rank numbers are better (closer to 1st).
        Returns {"error": ...} if the stock code is invalid or has no
        dividend ranking record.
    """
    if not stock_exists(stock_code):
        return {
            "error": (
                f"股票代號 {stock_code} 不在示範的 300 檔清單內，"
                "無法提供資料。"
            )
        }

    df = load_dividend_rankings()
    row = df.loc[df["股票代號"] == stock_code]
    if row.empty:
        return {
            "error": (
                f"股票代號 {stock_code} 沒有連續配息排名資料（可能是"
                "2025 年度尚未有配息紀錄）。"
            )
        }

    r = row.iloc[0]
    return {
        "股票代號": stock_code,
        "現金股利連N年遞增": None if pd.isna(r["現金股利連N年遞增"]) else int(r["現金股利連N年遞增"]),
        "連續N年發放現金股利": None if pd.isna(r["連續N年發放現金股利"]) else int(r["連續N年發放現金股利"]),
        "現金股利排名": None if pd.isna(r["現金股利排名"]) else int(r["現金股利排名"]),
        "現金股利殖利率排名": None if pd.isna(r["現金股利殖利率排名"]) else int(r["現金股利殖利率排名"]),
    }
