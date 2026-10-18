import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'finance.payout_tax_lines',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.payout_tax_lines);
  },
};
