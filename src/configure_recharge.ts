import { InfraiClient } from "./infrai_client.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("INFRAI_API_KEY is required");

const triggerBalance = Number(process.env.TRIGGER_BALANCE ?? "20");
const rechargeAmount = Number(process.env.RECHARGE_AMOUNT ?? "100");
const client = new InfraiClient(apiKey);

const configuration = await client.configureAutoRecharge(
  triggerBalance,
  rechargeAmount,
);
console.log(JSON.stringify(configuration, null, 2));
