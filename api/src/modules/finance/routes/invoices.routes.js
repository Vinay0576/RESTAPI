import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'finance.invoices',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.invoices);
  },
};
