import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'scheduling.match_attempts',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.match_attempts);
  },
};
