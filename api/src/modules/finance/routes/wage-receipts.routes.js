import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'finance.wage_receipts',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.wage_receipts);
  },
};
