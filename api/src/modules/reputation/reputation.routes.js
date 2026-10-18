import {createReputationController} from './reputation.controller.js';
import reviewsRoutes from './routes/reviews.routes.js';
import scoresRoutes from './routes/scores.routes.js';
import responsesRoutes from './routes/responses.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import favoritesRoutes from './routes/favorites.routes.js';

export default {
  domain: 'reputation',
  createController: createReputationController,
  routes: [
    reviewsRoutes,
    scoresRoutes,
    responsesRoutes,
    reportsRoutes,
    favoritesRoutes,
  ],
};
