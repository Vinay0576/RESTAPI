import {createReferralsController} from './referrals.controller.js';
import codesRoutes from './routes/codes.routes.js';
import intentsRoutes from './routes/intents.routes.js';
import attributionsRoutes from './routes/attributions.routes.js';

export default {
  domain: 'referrals',
  createController: createReferralsController,
  routes: [
    codesRoutes,
    intentsRoutes,
    attributionsRoutes,
  ],
};
