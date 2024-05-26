import React, { useEffect, useState } from 'react';
import axios from 'axios';

function App() {
  const [data, setData] = useState(null);

  useEffect(() => {
    axios.get('/api/data')
      .then(response => setData(response.data))
      .catch(error => console.error('Error fetching data:', error));
  }, []);

  return (
    <div>
      <h1>Solana Sniper Bot Interface</h1>
      <p>Data: {data ? JSON.stringify(data) : 'Loading...'}</p>
    </div>
  );
}

export default App;
