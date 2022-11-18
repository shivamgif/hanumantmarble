// add bootstrap css 
import 'bootstrap/dist/css/bootstrap.css'
import '../styles/globals.css'

import  NavBar from 'react-bootstrap/Navbar'

function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}

export default MyApp
