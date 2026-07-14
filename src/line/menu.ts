export const lineMenu = [
  {
    label: "查股票",
    action: { type: "postback", data: "action=stock_search" },
    purpose: "提示輸入股票代號，例如 2330",
  },
  {
    label: "今日市場",
    action: { type: "postback", data: "action=market_today" },
    purpose: "顯示資料集中最新一日的市場情緒",
  },
  {
    label: "我的持股",
    action: { type: "postback", data: "action=portfolio_view" },
    purpose: "查看持股；新增與刪除放在此流程",
  },
  {
    label: "設定",
    action: { type: "postback", data: "action=settings" },
    purpose: "管理晨報、隱私與資料刪除",
  },
] as const;
