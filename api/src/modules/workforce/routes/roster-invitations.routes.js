import {registerResourceRoutes} from '../../../http/resource-routes.js';

export default {
  resourceName: 'workforce.roster_invitations',
  async register(app, {resource, controller}) {
    registerResourceRoutes(app, resource, controller.roster_invitations);
  },
};
