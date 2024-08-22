import React from 'react';

export const Context = React.createContext((id: string) => {
    throw new Error('ChunkCollectorContext not setup');
});

export function __collectModule(moduleId: string): void {
    const c = React.useContext(Context);
    c(moduleId);

    return;
}
