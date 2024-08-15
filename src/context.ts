import React from 'react';

export const ModuleCollectorContext = React.createContext((id: string) => {
    console.log('useReportModule', id);
});
