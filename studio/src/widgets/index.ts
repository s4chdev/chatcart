// ChatCart's custom AG Studio widgets, added to Studio's widget menu under "ChatCart".
import { createWidgets } from 'ag-studio-react';
import type { AgWidgetsConfig } from 'ag-studio';
import RefundQueue from './RefundQueue';
import AgentFeed from './AgentFeed';

const icon = (emoji: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><text x="2" y="19" font-size="18">${emoji}</text></svg>`;

export const chatCartWidgets = (defaults: AgWidgetsConfig<any>): AgWidgetsConfig<any> =>
  (createWidgets as any)({
    additionalTypes: [
      {
        id: 'refund-queue',
        label: 'Refund approval queue',
        icon: icon('↩️'),
        form: (params: any) => params.createDefaults({ dataMappingItems: [] }),
        comp: RefundQueue,
        defaultSize: { width: 420, height: 360 },
        minSize: { width: 300, height: 200 },
        ai: {
          description: 'ChatCart refund approval queue: refunds waiting for the merchant, each with Approve and Reject buttons. Needs no data mapping.',
          usage: 'Use when the merchant wants to act on pending refunds. Add at most one per page.',
        },
      },
      {
        id: 'agent-feed',
        label: 'Agent activity feed',
        icon: icon('🤖'),
        form: (params: any) => params.createDefaults({ dataMappingItems: [] }),
        comp: AgentFeed,
        defaultSize: { width: 420, height: 600 },
        minSize: { width: 280, height: 240 },
        ai: {
          description: 'Chat-style timeline of the ChatCart agent action log (orders, captures, refunds, invoices). Needs no data mapping.',
          usage: 'Use to show what the AI shop agent has been doing recently.',
        },
      },
    ],
    menu: [{ label: 'ChatCart', widgetIds: ['refund-queue', 'agent-feed'] }, ...defaults.menu],
  });
