import {createIdentityController} from './identity.controller.js';
import profilesRoutes from './routes/profiles.routes.js';
import accountsRoutes from './routes/accounts.routes.js';
import membershipsRoutes from './routes/memberships.routes.js';
import appRegistrationsRoutes from './routes/app-registrations.routes.js';
import customerLoginLinksRoutes from './routes/customer-login-links.routes.js';
import deviceBindingsRoutes from './routes/device-bindings.routes.js';
import sessionBindingsRoutes from './routes/session-bindings.routes.js';
import consentsRoutes from './routes/consents.routes.js';
import phoneSessionProofsRoutes from './routes/phone-session-proofs.routes.js';

export default {
  domain: 'identity',
  createController: createIdentityController,
  routes: [
    profilesRoutes,
    accountsRoutes,
    membershipsRoutes,
    appRegistrationsRoutes,
    customerLoginLinksRoutes,
    deviceBindingsRoutes,
    sessionBindingsRoutes,
    consentsRoutes,
    phoneSessionProofsRoutes,
  ],
};
