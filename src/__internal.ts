import React from 'react';

export const ModuleCollectorContext = React.createContext((id: string) => {
    // Debug. Only available in the client in dev mode
    console.log('useReportModule', id);
});

export function __collectModule(moduleId: string) {
    const c = React.useContext(ModuleCollectorContext);
    c(moduleId);
    return;
}
