import { Container } from "react-bootstrap";
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';

export default function Quote(){
    return(
            <Container className="center box-border">
                <h1>Get Your Quotation</h1>
                <Form name="contact" netlify>
                    <Form.Group controlId="name">
                    <Form.Label>Name</Form.Label>
                    <Form.Control type="email" placeholder="Enter your fullname" />
                    </Form.Group>
                    <Form.Group controlId="formBasicEmail">
                    <Form.Label>Email address</Form.Label>
                    <Form.Control type="email" placeholder="Enter email" />
                    <Form.Text className="text-muted"> 
                            <p>We'll never share your email with anyone else.</p>
                    </Form.Text>
                    </Form.Group>
                    <Form.Group controlId="brand">
                        <Form.Label>Select Brand</Form.Label>
                        <Form.Select>
                        <option>Kajaria</option>
                        <option>Cera</option>
                        </Form.Select>
                    </Form.Group>
                    <Form.Group controlId="product">
                        <Form.Label>Product Name/Number</Form.Label>
                        <Form.Control placeholder="Enter product name/number" />
                    </Form.Group>
                    <Form.Group controlId="quantity">
                        <Form.Label>Product Name/Number</Form.Label>
                        <Form.Control placeholder="Enter quantity" />
                    </Form.Group>
        
                    <br/>
                    <Button variant="warning" type="submit">Send</Button>
                </Form>
            </Container>
    );
}