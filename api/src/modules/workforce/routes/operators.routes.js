import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'workforce.operators',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.operators);
  },
};
