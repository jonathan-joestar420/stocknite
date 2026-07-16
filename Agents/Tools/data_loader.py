"""
Loads the CMoney hackathon CSV datasets into pandas DataFrames, cached in
memory so repeated tool calls don't re-read from disk/network every time.

All data is scoped to 2025 (the demo "today" is 2025/12/31), and limited to
the 300 sample stocks provided in the data package.

Data source resolution:
    1. Local disk (Datasets/ next to Agents/) if present -- used for local
       dev (adk web / adk run), no AWS calls needed, fastest path.
    2. S3 fallback (s3://aic-cmoney-resource/, us-west-2) if the local file
       doesn't exist -- used once deployed to AgentCore Runtime, since the
       Datasets/ folder lives outside Agents/ and isn't included in the
       deployment package (AgentCore only zips the entrypoint's own
       directory tree).
Override the bucket via the DATASETS_S3_BUCKET env var if needed.
"""

import functools
import io
import os
from pathlib import Path

import boto3
import pandas as pd

DATASETS_DIR = (
    Path(__file__).resolve().parent.parent.parent / "Datasets"
)

DATASETS_S3_BUCKET = os.environ.get("DATASETS_S3_BUCKET", "aic-cmoney-resource")

# "Today" for the demo, per the field dictionary's usage notes.
DEMO_TODAY = pd.Timestamp("2025-12-31")


def _read_csv(filename: str, date_col: str | None = None) -> pd.DataFrame:
    local_path = DATASETS_DIR / filename
    if local_path.exists():
        df = pd.read_csv(local_path, dtype={"股票代號": str})
    else:
        s3 = boto3.client("s3")
        obj = s3.get_object(Bucket=DATASETS_S3_BUCKET, Key=filename)
        df = pd.read_csv(io.BytesIO(obj["Body"].read()), dtype={"股票代號": str})

    if date_col and date_col in df.columns:
        df[date_col] = pd.to_datetime(df[date_col].astype(str), format="mixed")
    return df


@functools.lru_cache(maxsize=1)
def load_wide_summary() -> pd.DataFrame:
    """One row per stock: price, valuation, returns, sentiment counts, etc."""
    df = _read_csv("09_Wide_Table_Summary_One_Row_Per_Stock_2025.csv")
    return df.set_index("股票代號", drop=False)


@functools.lru_cache(maxsize=1)
def load_institutional_trading() -> pd.DataFrame:
    """Daily institutional (外資/投信/自營商) buy/sell data, 2025 full year."""
    return _read_csv("02_Institutional_Trading_2025.csv", date_col="日期")


@functools.lru_cache(maxsize=1)
def load_forum_stats() -> pd.DataFrame:
    """Daily forum post/reply counts and bullish/bearish stance, 2025 full year."""
    return _read_csv("10_Forum_Posts_Replies_Daily_Stats_2025.csv", date_col="日期")


@functools.lru_cache(maxsize=1)
def load_industry_mapping() -> pd.DataFrame:
    """Static industry classification per stock."""
    return _read_csv("07_Industry_Classification_Mapping.csv")


@functools.lru_cache(maxsize=1)
def load_daily_prices() -> pd.DataFrame:
    """Daily OHLC price/valuation data, 2025 full year, for all 300 stocks.

    Used by the CFA quant tools (historical return, volatility, covariance,
    correlation) which need a per-stock daily closing price time series.
    """
    return _read_csv("01_Price_Valuation_2025.csv", date_col="日期")


@functools.lru_cache(maxsize=1)
def load_dividends() -> pd.DataFrame:
    """2025 annual cash dividend totals per stock (used as the D term in
    the historical period return formula: R = (P_end - P_start + D) / P_start).
    """
    return _read_csv("05_Dividend_Ex_Dividend_2025.csv")


@functools.lru_cache(maxsize=1)
def load_return_rates() -> pd.DataFrame:
    """Daily multi-window return rates (日/週/月/季/半年/年報酬率) per
    stock, 2025 full year. Only 季/年報酬率 made it into the wide summary
    table -- this is the full daily series with the shorter windows
    (日/週/月/半年) plus the excess-return-vs-market figure.
    """
    return _read_csv("03_Return_Rate_2025.csv", date_col="日期")


@functools.lru_cache(maxsize=1)
def load_momentum() -> pd.DataFrame:
    """Daily short/medium-term momentum indicators per stock, 2025 full
    year: N-day price change %, moving-average bias (月/季/年線乖離),
    N-day new-high streak, N-day consecutive-up streak. Covers 266 of the
    300 stocks -- the 34 not covered are ETFs (see load_dividend_rankings,
    which has a separate ETF-specific dividend table instead).
    """
    return _read_csv("04_Distance_from_High_Low_Momentum_2025.csv", date_col="日期")


@functools.lru_cache(maxsize=1)
def load_dividend_rankings() -> pd.DataFrame:
    """Dividend growth trend + ranking percentile per stock/ETF, 2025.
    Individual stocks (06_Consecutive_Dividend_Stocks) and ETFs
    (06b_Consecutive_Dividend_ETF) use the same schema but are disjoint
    stock-code sets, so they're concatenated into one table here. Adds
    現金股利連N年遞增 (dividend growth trend) and 現金股利排名/
    現金股利殖利率排名 (rank among the 300-stock universe) -- only the
    raw streak count (連續N年發放現金股利) made it into the wide summary
    table, not these two.
    """
    stocks = _read_csv("06_Consecutive_Dividend_Stocks_2025.csv")
    etfs = _read_csv("06b_Consecutive_Dividend_ETF_2025.csv")
    return pd.concat([stocks, etfs], ignore_index=True)


def stock_exists(stock_code: str) -> bool:
    """Check whether a stock code is within the 300-stock demo universe."""
    return stock_code in load_wide_summary().index


def get_closing_price_series(stock_code: str) -> list[tuple[str, float]]:
    """Return a chronologically sorted list of (date_str, close_price) for
    one stock across all of 2025. Plain Python types only (no numpy/pandas
    objects leak out), so downstream quant math can use pure Python.
    """
    df = load_daily_prices()
    subset = df.loc[df["股票代號"] == stock_code, ["日期", "收盤價"]].dropna()
    subset = subset.sort_values("日期")
    return [
        (row["日期"].strftime("%Y-%m-%d"), float(row["收盤價"]))
        for _, row in subset.iterrows()
    ]


def get_annual_cash_dividend(stock_code: str) -> float:
    """Total 2025 cash dividend per share (元) for one stock. Returns 0.0
    if the stock paid no dividend or has no dividend record.
    """
    df = load_dividends()
    subset = df.loc[df["股票代號"] == stock_code, "現金股利合計(元)"]
    if subset.empty or pd.isna(subset.iloc[0]):
        return 0.0
    return float(subset.iloc[0])
