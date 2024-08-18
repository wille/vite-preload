import { useState } from 'react'
import styles from './Cart.module.css';

function Card() {
  const [count, setCount] = useState(0)

  return (
    <div className={"card " + styles.bg}>
      <button onClick={() => setCount((count) => count + 1)}>
        count iss {count}
      </button>
      <p>
        Edit <code>src/App.tsx</code> and save to test HMR
      </p>
    </div>
  )
}

export default Card
