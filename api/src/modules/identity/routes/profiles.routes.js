import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'identity.profiles',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.profiles);
  },
};
