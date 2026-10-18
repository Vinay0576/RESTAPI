import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'finance.contract_lines',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.contract_lines);
  },
};
