import React, { Suspense } from 'react';
import reactLogo from './assets/react.svg';
import './App.css';

function slowImport(promise: () => Promise<any>) {
    return () => {
        return new Promise<any>((resolve) => {
            setTimeout(() => resolve(promise()), 2000);
        });
    };
}

// Works also with SSR as expected
const Card = React.lazy(slowImport(() => import('./Card')));

export default function App() {
    return (
        <>
            <div>
                <a href="https://vitejs.dev" target="_blank">
                    <img src="/vite.svg" className="logo" alt="Vite logo" />
                </a>
                <a href="https://reactjs.org" target="_blank">
                    <img
                        src={reactLogo}
                        className="logo react"
                        alt="React logo"
                    />
                </a>
            </div>
            <h1>Vite + React</h1>

            <Suspense fallback={<p>Loading card component...</p>}>
                <Card />
            </Suspense>

            <p className="read-the-docs">
                Click on the Vite and React logos to learn more
            </p>
        </>
    );
}
