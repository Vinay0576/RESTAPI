import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'workforce.availability_sessions',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.availability_sessions);
  },
};
