import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'compliance.documents',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.documents);
  },
};
