import Link from 'next/link';
import {Nav,Container, Navbar} from 'react-bootstrap';

const Header = () => {    
    return (    
        <Navbar className='site-header sticky-top' expand="sm" variant='dark'>
                <Container>
                    <Navbar.Brand href="/"><h3>Hanumant Marble</h3></Navbar.Brand>
                    <Navbar.Toggle aria-controls="basic-navbar-nav" />
                    <Navbar.Collapse id="basic-navbar-nav">
                    <Nav className="me-auto">
                            <Nav.Item className='px-4'><Link href="/#products">Products</Link></Nav.Item>
                            <Nav.Item  className='px-4'><Link href="/locations">Locations</Link></Nav.Item>
                            <Nav.Item className='px-4'><Link href="/quote">Get Your Quotation</Link></Nav.Item>
                            <Nav.Item className='px-4'><Link href="/about">About Us</Link></Nav.Item>
                    </Nav>
                    </Navbar.Collapse>
                </Container>
        </Navbar>
);}

export default Header;