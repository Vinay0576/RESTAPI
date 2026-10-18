import {createSupportController} from './support.controller.js';
import casesRoutes from './routes/cases.routes.js';
import damageDetailsRoutes from './routes/damage-details.routes.js';
import payoutHoldsRoutes from './routes/payout-holds.routes.js';
import conversationsRoutes from './routes/conversations.routes.js';
import messagesRoutes from './routes/messages.routes.js';
import agentPresenceRoutes from './routes/agent-presence.routes.js';
import appFeedbackRoutes from './routes/app-feedback.routes.js';

export default {
  domain: 'support',
  createController: createSupportController,
  routes: [
    casesRoutes,
    damageDetailsRoutes,
    payoutHoldsRoutes,
    conversationsRoutes,
    messagesRoutes,
    agentPresenceRoutes,
    appFeedbackRoutes,
  ],
};
