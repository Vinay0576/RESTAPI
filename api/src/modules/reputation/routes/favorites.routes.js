import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'reputation.favorites',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.favorites);
  },
};
