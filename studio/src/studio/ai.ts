// AG Studio Agent Framework setup. A custom primary agent, "ChatCart Ops", leads the conversation:
// it starts from Studio's built-in Lead (its instructions and tools, including delegate_to), adds
// shop knowledge and two ChatCart tools (refund policy, live refund queue), and hands dashboard work
// to Studio's built-in Planning, Data, Page and Widget agents. The LLM is reached through ChatCart's
// Express proxy (/api/studio/ai/responses), which holds the key.
import { createAiHarness, directLlmRunner, type AgAiHarnessSetup, type AgAiPromptStarter, type AgStudioApi } from 'ag-studio';
import { openaiAdapter } from './openai-adapter';
import type { StudioPayload } from '../types';

const PROMPT_STARTERS: AgAiPromptStarter[] = [
  { label: 'Refund rate by product this week', prompt: 'Show refund rate by product this week as a new widget on this page.' },
  { label: 'Which refunds need me?', prompt: 'Which refunds are waiting for my approval, and is any of them unusual compared with past refunds?' },
  { label: 'Best sellers', prompt: 'Add a chart of units sold by product category per week.' },
  { label: 'Summarise this page', prompt: 'Summarise what this page shows and what stands out for the shop this week.' },
];

const opsInstructions = (d: StudioPayload) => `
You are ChatCart Ops, the analytics assistant inside the merchant dashboard of "${d.shop}", a small Jodhpur handicrafts shop.
Buyers chat with an AI shop agent on a WhatsApp-style page; it takes PayPal payments (Orders v2), executes refunds (Payments v2)
and sends PayPal invoices for bulk orders (Invoicing v2). Money is in ${d.currency}.
Shop rules: the agent auto-refunds up to ${d.policy.autoRefundLimit} ${d.currency} within ${d.policy.refundWindowDays} days; anything else waits
in the merchant's refund approval queue. Orders of ${d.policy.bulkQtyThreshold}+ units get an invoice.
- For refund rate by product or category use the "productRefundRate" measure with orderItems.product / orderItems.category; the
  overall rate is "refundRate". Revenue is orders.captured (or orderItems.captured per product).
- "This week" / "last 7 days" means a filter on the calendar or the table's date field for the last 7 days.
- When the merchant asks for something visual, build it as a widget on the current page (delegate to Page and Widget agents).
- Use get_refund_queue and get_shop_policy for questions about pending refunds or rules. You cannot approve or reject refunds
  yourself: tell the merchant to use the Approve / Reject buttons in the "Refund approval queue" widget.
- Keep replies short and concrete, in plain English a busy shop owner reads on a phone.`;

/** `models` are the ids the server allows; `getData` returns the latest payload from /api/studio/data. */
export function buildAi(models: string[], getData: () => StudioPayload): AgAiHarnessSetup {
  const adapter = openaiAdapter({ endpoint: '/api/studio/ai', model: models[0] });

  const shopTools = (api: AgStudioApi) => [
    api.defineAiTool({
      name: 'get_shop_policy',
      description: "ChatCart's refund and invoicing guardrails for this shop, as enforced in code.",
      params: (s: any) => s.object({}),
      execute: (_args: unknown, ctx: any) => {
        const d = getData();
        return ctx.success(JSON.stringify({ shop: d.shop, currency: d.currency, ...d.policy, paypalMode: d.mode.paypalMode, demoData: d.demo }));
      },
    } as any),
    api.defineAiTool({
      name: 'get_refund_queue',
      description: 'Refunds currently waiting for the merchant (id, order, buyer, amount, reason, policy rule that held it back).',
      params: (s: any) => s.object({}),
      execute: (_args: unknown, ctx: any) => {
        const pending = getData().refunds.filter((r) => r.status === 'PENDING_MERCHANT_APPROVAL');
        return ctx.success(JSON.stringify({ count: pending.length, refunds: pending }));
      },
    } as any),
  ];

  return ({ api }) =>
    createAiHarness(api, ({ builtIn }) => {
      const lead = builtIn.lead as any;
      const ops = {
        ...lead,
        id: 'ops',
        name: 'ChatCart Ops',
        description: 'Analytics assistant for the ChatCart merchant: builds widgets and answers questions about orders, refunds and invoices.',
        instructions: (ctx: any, params: any) => `${lead.instructions ? lead.instructions(ctx, params) : ''}\n\n${opsInstructions(getData())}`,
        tools: (ctx: any, params: any) => [...(lead.tools ? lead.tools(ctx, params) : []), ...shopTools(api)],
      };
      const specialists = (['planning', 'data', 'page', 'widget'] as const).map((id) => directLlmRunner({ ...(builtIn[id] as any), adapter }));
      return {
        agents: [directLlmRunner({ ...ops, adapter }), ...specialists],
        primary: 'ops',
        promptStarters: PROMPT_STARTERS,
        models: models.length > 1 ? models.map((id) => ({ id, label: id })) : undefined,
      } as any;
    });
}
