import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'support.agent_presence',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.agent_presence);
  },
};
