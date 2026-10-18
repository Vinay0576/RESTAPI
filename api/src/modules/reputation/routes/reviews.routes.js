import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'reputation.reviews',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.reviews);
  },
};
