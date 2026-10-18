import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'logistics.booking_quotes',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.booking_quotes);
  },
};
