import { Container } from "react-bootstrap";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";

export default function Quote() {
  return (
    <div className="home">
      <Container className="center box-border">
        <div className="form-box">
          <span className="heading">Get Your Quotation</span>
          <Form name="contact" method="POST" data-netlify="true">
            <input type="hidden" name="form-name" value="contact" />
            <Form.Group controlId="name">
              <Form.Label>Name</Form.Label>
              <Form.Control
                name="fullname"
                type="text"
                placeholder="Enter your fullname"
              />
            </Form.Group>
            <Form.Group controlId="formBasicEmail">
              <Form.Label>Email address</Form.Label>
              <Form.Control
                name="email"
                type="email"
                placeholder="Enter email"
              />
              <Form.Text className="text-muted">
                <p>We will never share your email with anyone else.</p>
              </Form.Text>
            </Form.Group>
            <Form.Group controlId="brand">
              <Form.Label>Select Brand</Form.Label>
              <Form.Select name="brand">
                <option>Kajaria</option>
                <option>Cera</option>
              </Form.Select>
            </Form.Group>
            <Form.Group controlId="product">
              <Form.Label>Product Name/Number</Form.Label>
              <Form.Control
                name="product"
                type="text"
                placeholder="Enter product name/number"
              />
            </Form.Group>
            <Form.Group controlId="quantity">
              <Form.Label>Quantity</Form.Label>
              <Form.Control
                name="quantity"
                type="text"
                placeholder="Enter quantity"
              />
            </Form.Group>

            <br />
            <button className="custombtn2" type="submit">
              Send
            </button>
          </Form>
        </div>
      </Container>
    </div>
  );
}
