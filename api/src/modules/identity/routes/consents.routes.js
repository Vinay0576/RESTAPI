import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'identity.consents',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.consents);
  },
};
