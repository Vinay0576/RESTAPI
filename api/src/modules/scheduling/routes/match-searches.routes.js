import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'scheduling.match_searches',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.match_searches);
  },
};
