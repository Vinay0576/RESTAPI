import {createRentalsController} from './rentals.controller.js';
import customerVehiclesRoutes from './routes/customer-vehicles.routes.js';
import nominatedOperatorsRoutes from './routes/nominated-operators.routes.js';
import requestsRoutes from './routes/requests.routes.js';
import requestAttachmentsRoutes from './routes/request-attachments.routes.js';
import offersRoutes from './routes/offers.routes.js';
import bookingsRoutes from './routes/bookings.routes.js';
import siteSnapshotsRoutes from './routes/site-snapshots.routes.js';
import operatorNominationsRoutes from './routes/operator-nominations.routes.js';
import verificationLinksRoutes from './routes/verification-links.routes.js';
import partySnapshotsRoutes from './routes/party-snapshots.routes.js';
import attachmentLinesRoutes from './routes/attachment-lines.routes.js';
import staffingRoutes from './routes/staffing.routes.js';
import assignmentsRoutes from './routes/assignments.routes.js';
import operatorHiresRoutes from './routes/operator-hires.routes.js';
import lifecycleEventsRoutes from './routes/lifecycle-events.routes.js';
import scheduleChangesRoutes from './routes/schedule-changes.routes.js';
import overtimeRoutes from './routes/overtime.routes.js';
import incidentsRoutes from './routes/incidents.routes.js';
import workSessionsRoutes from './routes/work-sessions.routes.js';

export default {
  domain: 'rentals',
  createController: createRentalsController,
  routes: [
    customerVehiclesRoutes,
    nominatedOperatorsRoutes,
    requestsRoutes,
    requestAttachmentsRoutes,
    offersRoutes,
    bookingsRoutes,
    siteSnapshotsRoutes,
    operatorNominationsRoutes,
    verificationLinksRoutes,
    partySnapshotsRoutes,
    attachmentLinesRoutes,
    staffingRoutes,
    assignmentsRoutes,
    operatorHiresRoutes,
    lifecycleEventsRoutes,
    scheduleChangesRoutes,
    overtimeRoutes,
    incidentsRoutes,
    workSessionsRoutes,
  ],
};
