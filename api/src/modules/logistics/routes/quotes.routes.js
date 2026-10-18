import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'logistics.quotes',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.quotes);
  },
};
