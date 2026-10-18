import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'identity.customer_login_links',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.customer_login_links);
  },
};
