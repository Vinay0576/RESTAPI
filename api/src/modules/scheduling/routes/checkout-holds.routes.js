import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'scheduling.checkout_holds',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.checkout_holds);
  },
};
