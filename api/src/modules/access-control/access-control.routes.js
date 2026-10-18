import {createAccessControlController} from './access-control.controller.js';
import rolesRoutes from './routes/roles.routes.js';
import capabilitiesRoutes from './routes/capabilities.routes.js';
import roleCapabilitiesRoutes from './routes/role-capabilities.routes.js';
import roleGrantsRoutes from './routes/role-grants.routes.js';

export default {
  domain: 'access_control',
  createController: createAccessControlController,
  routes: [
    rolesRoutes,
    capabilitiesRoutes,
    roleCapabilitiesRoutes,
    roleGrantsRoutes,
  ],
};
