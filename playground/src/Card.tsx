import { useEffect, useState } from 'react';
import styles from './Cart.module.css';

export default function Card() {
    const [count, setCount] = useState(0);

    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    return (
        <div className={'card ' + styles.bg}>
            <button onClick={() => setCount((count) => count + 1)}>
                count iss {count}
            </button>
            <p>
                Edit <code>src/App.tsx</code> and save to test HMR
                <br />
                Client: {isClient ? 'Yes' : 'No'}
            </p>
        </div>
    );
}
