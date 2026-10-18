import {createWorkforceController} from './workforce.controller.js';
import operatorsRoutes from './routes/operators.routes.js';
import skillClaimsRoutes from './routes/skill-claims.routes.js';
import skillReviewsRoutes from './routes/skill-reviews.routes.js';
import rosterMembershipsRoutes from './routes/roster-memberships.routes.js';
import rosterInvitationsRoutes from './routes/roster-invitations.routes.js';
import availabilitySessionsRoutes from './routes/availability-sessions.routes.js';
import categoryRateVersionsRoutes from './routes/category-rate-versions.routes.js';

export default {
  domain: 'workforce',
  createController: createWorkforceController,
  routes: [
    operatorsRoutes,
    skillClaimsRoutes,
    skillReviewsRoutes,
    rosterMembershipsRoutes,
    rosterInvitationsRoutes,
    availabilitySessionsRoutes,
    categoryRateVersionsRoutes,
  ],
};
