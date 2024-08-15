import React from 'react';
import { ModuleCollectorContext } from './context';

export function __collectModule(moduleId: string) {
    const c = React.useContext(ModuleCollectorContext);
    c(moduleId);
    return;
}
