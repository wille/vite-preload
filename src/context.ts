import React from 'react';

export const ModuleCollectorContext = React.createContext((id: string) => {
    // Debug. Should do nothing on the client
    console.log('useReportModule', id);
});
