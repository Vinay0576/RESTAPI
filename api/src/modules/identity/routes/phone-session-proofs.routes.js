import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'identity.phone_session_proofs',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.phone_session_proofs);
  },
};
