import {createLogisticsController} from './logistics.controller.js';
import custodyEventsRoutes from './routes/custody-events.routes.js';
import challengesRoutes from './routes/challenges.routes.js';
import conditionReportsRoutes from './routes/condition-reports.routes.js';
import conditionPhotosRoutes from './routes/condition-photos.routes.js';
import attachmentMovementsRoutes from './routes/attachment-movements.routes.js';
import pickupChecksRoutes from './routes/pickup-checks.routes.js';
import positionsRoutes from './routes/positions.routes.js';
import tariffVersionsRoutes from './routes/tariff-versions.routes.js';
import quotesRoutes from './routes/quotes.routes.js';
import bookingQuotesRoutes from './routes/booking-quotes.routes.js';

export default {
  domain: 'logistics',
  createController: createLogisticsController,
  routes: [
    custodyEventsRoutes,
    challengesRoutes,
    conditionReportsRoutes,
    conditionPhotosRoutes,
    attachmentMovementsRoutes,
    pickupChecksRoutes,
    positionsRoutes,
    tariffVersionsRoutes,
    quotesRoutes,
    bookingQuotesRoutes,
  ],
};
