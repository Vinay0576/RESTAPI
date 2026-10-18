import {createSchedulingController} from './scheduling.controller.js';
import resourcesRoutes from './routes/resources.routes.js';
import blocksRoutes from './routes/blocks.routes.js';
import checkoutHoldsRoutes from './routes/checkout-holds.routes.js';
import reservationsRoutes from './routes/reservations.routes.js';
import matchSearchesRoutes from './routes/match-searches.routes.js';
import matchAttemptsRoutes from './routes/match-attempts.routes.js';

export default {
  domain: 'scheduling',
  createController: createSchedulingController,
  routes: [
    resourcesRoutes,
    blocksRoutes,
    checkoutHoldsRoutes,
    reservationsRoutes,
    matchSearchesRoutes,
    matchAttemptsRoutes,
  ],
};
