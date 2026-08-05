import nodemailer from "nodemailer";

// Create a reusable transporter using the Gmail SMTP server.
// Credentials are read from environment variables (EMAIL_USER, EMAIL_PASS).
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// Send a plain text email via Nodemailer.
// Returns the send result, or throws if the mail could not be sent.
const sendEmail = async ({ to, subject, text, html }) => {
    const mailOptions = {
        from: `"Your Store" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        text,
        html,
    };
    return transporter.sendMail(mailOptions);
};

// Build the human readable delivery address from the order address object.
const buildDeliveryAddress = (address) => {
    if (!address) return "N/A";
    const parts = [
        address.street,
        address.city,
        address.state,
        address.zipcode,
        address.country,
    ].filter((part) => part && part.trim());
    return parts.length ? parts.join(", ") : "N/A";
};

// Build a formatted order date & time string from a JS timestamp (milliseconds).
const formatOrderDate = (timestamp) => {
    if (!timestamp) return "N/A";
    const date = new Date(timestamp);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
};

// Format a price value for display in the email body.
const formatPrice = (value) => {
    const price = Number(value);
    return isNaN(price) ? "N/A" : `$${price.toFixed(2)}`;
};

// Compose the email body for a newly placed order.
// 'order' is the saved Mongoose order document (with items and address).
const buildOrderEmailBody = (order) => {
    const address = order.address || {};
    const items = Array.isArray(order.items) ? order.items : [];

    // Customer details from the delivery address.
    const customerName = [address.firstName, address.lastName].filter(Boolean).join(" ") || "N/A";
    const phoneNumber = address.phone || "N/A";
    const emailAddress = address.email || "N/A";
    const deliveryAddress = buildDeliveryAddress(address);
    const paymentMethod = order.paymentMethod || "N/A";
    const orderDate = formatOrderDate(order.date);

    // Build a readable list of ordered products.
    const productLines = items.map((item) => {
        const name = item.name || "N/A";
        const quantity = item.quantity || 1;
        const price = formatPrice(item.price);
        return `  - ${name} | Quantity: ${quantity} | Price: ${price}`;
    });

    const orderedProducts = productLines.length
        ? productLines.join("\n")
        : "  - No items found";

    const totalAmount = formatPrice(order.amount);

    return [
        "New Order Received",
        "==================",
        "",
        `Order ID: ${order.orderId || "N/A"}`,
        `Customer Name: ${customerName}`,
        `Phone Number: ${phoneNumber}`,
        `Email Address: ${emailAddress}`,
        `Delivery Address: ${deliveryAddress}`,
        "",
        "Ordered Products:",
        orderedProducts,
        "",
        `Total Amount: ${totalAmount}`,
        `Payment Method: ${paymentMethod}`,
        `Order Date & Time: ${orderDate}`,
        "",
        "Thank you for your business!",
    ].join("\n");
};

// Send the "New Order Received" notification email to the store owner.
// 'order' is the saved Mongoose order document.
const sendOrderNotificationEmail = async (order) => {
    const to = process.env.EMAIL_USER;
    const subject = "New Order Received";
    const body = buildOrderEmailBody(order);
    return sendEmail({ to, subject, text: body });
};

// ---------------------------------------------------------------------------
// Customer order confirmation email
// ---------------------------------------------------------------------------

// Escape a value for safe embedding inside an HTML email.
const escapeHtml = (value) =>
    String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

// Format a price using the store's currency (Pakistani Rupees).
const formatRupees = (value) => {
    const price = Number(value);
    if (isNaN(price)) return "N/A";
    return `Rs ${price.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

// Build the professional, responsive HTML body for the customer confirmation email.
const buildOrderConfirmationHtml = (order) => {
    const address = order.address || {};
    const items = Array.isArray(order.items) ? order.items : [];

    const customerName = [address.firstName, address.lastName].filter(Boolean).join(" ") || "N/A";
    const deliveryAddress = buildDeliveryAddress(address);
    const paymentMethod = order.paymentMethod === "COD" ? "Cash On Delivery" : (order.paymentMethod || "N/A");
    const orderDate = formatOrderDate(order.date);
    const totalAmount = formatRupees(order.amount);

    const itemRows = items
        .map((item) => {
            const name = item.name || "N/A";
            const qty = Number(item.quantity) || 1;
            const price = formatRupees(item.price);
            const lineTotal = formatRupees((Number(item.price) || 0) * qty);
            return `                    <tr>
                        <td style="padding:10px 12px; border-bottom:1px solid #E8EDF5; font-size:14px; color:#0B1424; vertical-align:top;">${escapeHtml(name)}</td>
                        <td style="padding:10px 12px; border-bottom:1px solid #E8EDF5; font-size:14px; color:#52607A; text-align:center; white-space:nowrap;">${qty}</td>
                        <td style="padding:10px 12px; border-bottom:1px solid #E8EDF5; font-size:14px; color:#52607A; text-align:right; white-space:nowrap;">${price}</td>
                        <td style="padding:10px 12px; border-bottom:1px solid #E8EDF5; font-size:14px; font-weight:600; color:#0B1424; text-align:right; white-space:nowrap;">${lineTotal}</td>
                    </tr>`;
        })
        .join("\n");

    const itemsHtml = itemRows
        ? itemRows
        : `                    <tr>
                        <td colspan="4" style="padding:12px; font-size:14px; color:#52607A; text-align:center;">No items found</td>
                    </tr>`;

    return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>Order Confirmation</title>
    <style>
        @media only screen and (max-width: 620px) {
            .email-container { width: 100% !important; }
            .email-body { padding: 20px 18px !important; }
        }
    </style>
</head>
<body style="margin:0; padding:0; background-color:#F4F6FA; -webkit-text-size-adjust:none; text-size-adjust:none;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F6FA; padding:24px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; background-color:#FFFFFF; border:1px solid #E2E8F0; border-radius:10px; overflow:hidden;">
                    <tr>
                        <td style="background:linear-gradient(135deg, #2456E6 0%, #0EA5E9 100%); padding:28px 32px; text-align:center;">
                            <div style="font-size:24px; font-weight:700; color:#FFFFFF; letter-spacing:0.5px;">Voltique Hub</div>
                            <div style="font-size:13px; color:#E0ECFF; margin-top:4px;">Battery Chargers &amp; Power Solutions</div>
                        </td>
                    </tr>
                    <tr>
                        <td class="email-body" style="padding:32px;">
                            <p style="margin:0 0 6px; font-size:22px; font-weight:700; color:#0B1424;">Thank You for Your Order!</p>
                            <p style="margin:0 0 24px; font-size:14px; color:#52607A; line-height:1.6;">
                                Hi <strong style="color:#0B1424;">${escapeHtml(customerName)}</strong>,<br/>
                                We have received your order and it will be processed soon. Our team is working hard to get it ready for delivery.
                            </p>

                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F8FAFF; border:1px solid #E2E8F0; border-radius:8px; margin-bottom:24px;">
                                <tr>
                                    <td style="padding:12px 16px; font-size:12px; letter-spacing:0.6px; color:#52607A; text-transform:uppercase; width:42%;">Order ID</td>
                                    <td style="padding:12px 16px; font-size:14px; font-weight:600; color:#0B1424; text-align:right;">${escapeHtml(order.orderId || "N/A")}</td>
                                </tr>
                                <tr>
                                    <td style="padding:12px 16px; border-top:1px solid #E2E8F0; font-size:12px; letter-spacing:0.6px; color:#52607A; text-transform:uppercase;">Order Date</td>
                                    <td style="padding:12px 16px; border-top:1px solid #E2E8F0; font-size:14px; color:#0B1424; text-align:right;">${escapeHtml(orderDate)}</td>
                                </tr>
                                <tr>
                                    <td style="padding:12px 16px; border-top:1px solid #E2E8F0; font-size:12px; letter-spacing:0.6px; color:#52607A; text-transform:uppercase;">Payment Method</td>
                                    <td style="padding:12px 16px; border-top:1px solid #E2E8F0; font-size:14px; color:#0B1424; text-align:right;">${escapeHtml(paymentMethod)}</td>
                                </tr>
                            </table>

                            <div style="font-size:13px; font-weight:700; letter-spacing:0.8px; color:#2456E6; text-transform:uppercase; margin-bottom:10px;">Ordered Products</div>
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E2E8F0; border-radius:8px; margin-bottom:12px;">
                                <tr>
                                    <th style="padding:10px 12px; background:#EEF2FF; border-bottom:1px solid #E2E8F0; font-size:11px; letter-spacing:0.5px; color:#2456E6; text-align:left; text-transform:uppercase;">Product</th>
                                    <th style="padding:10px 12px; background:#EEF2FF; border-bottom:1px solid #E2E8F0; font-size:11px; letter-spacing:0.5px; color:#2456E6; text-align:center; text-transform:uppercase;">Qty</th>
                                    <th style="padding:10px 12px; background:#EEF2FF; border-bottom:1px solid #E2E8F0; font-size:11px; letter-spacing:0.5px; color:#2456E6; text-align:right; text-transform:uppercase;">Price</th>
                                    <th style="padding:10px 12px; background:#EEF2FF; border-bottom:1px solid #E2E8F0; font-size:11px; letter-spacing:0.5px; color:#2456E6; text-align:right; text-transform:uppercase;">Total</th>
                                </tr>
${itemsHtml}
                                <tr>
                                    <td colspan="3" style="padding:12px; font-size:14px; color:#52607A; font-weight:600; text-align:right;">Grand Total</td>
                                    <td style="padding:12px; font-size:16px; font-weight:700; color:#0B1424; text-align:right; white-space:nowrap;">${totalAmount}</td>
                                </tr>
                            </table>

                            <div style="margin:24px 0 0; background:#F4F6FA; border:1px solid #E2E8F0; border-radius:8px; padding:16px 18px;">
                                <div style="font-size:12px; font-weight:700; letter-spacing:0.8px; color:#2456E6; text-transform:uppercase; margin-bottom:8px;">Delivery Address</div>
                                <div style="font-size:14px; color:#0B1424; line-height:1.6;">${escapeHtml(deliveryAddress)}</div>
                            </div>

                            <p style="margin:24px 0 0; font-size:14px; color:#52607A; line-height:1.6;">
                                Your order has been received and is currently being processed. You can track its status anytime, and we will keep you updated as it moves along.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background:#0B1424; padding:22px 32px; text-align:center;">
                            <div style="font-size:13px; color:#E0ECFF; line-height:1.7;">
                                Need help? Contact us at<br/>
                                <a href="mailto:voltiquehubsupport@gmail.com" style="color:#FFFFFF; font-weight:700; text-decoration:none;">voltiquehubsupport@gmail.com</a><br/>
                                <span style="color:#FFFFFF; font-weight:700;">03063720139</span>
                            </div>
                            <div style="font-size:11px; color:#94A3B8; margin-top:10px;">&copy; Voltique Hub &middot; All Rights Reserved</div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
};

// Build a plain-text fallback for the customer confirmation email.
const buildOrderConfirmationText = (order) => {
    const address = order.address || {};
    const items = Array.isArray(order.items) ? order.items : [];

    const customerName = [address.firstName, address.lastName].filter(Boolean).join(" ") || "N/A";
    const deliveryAddress = buildDeliveryAddress(address);
    const paymentMethod = order.paymentMethod === "COD" ? "Cash On Delivery" : (order.paymentMethod || "N/A");
    const orderDate = formatOrderDate(order.date);
    const totalAmount = formatRupees(order.amount);

    const productLines = items.map((item) => {
        const name = item.name || "N/A";
        const quantity = item.quantity || 1;
        const price = formatRupees(item.price);
        return `  - ${name} | Quantity: ${quantity} | Price: ${price}`;
    });

    const orderedProducts = productLines.length ? productLines.join("\n") : "  - No items found";

    return [
        "Thank You for Your Order!",
        "=========================",
        "",
        `Hi ${customerName},`,
        "",
        "We have received your order and it will be processed soon. Our team is working hard to get it ready for delivery.",
        "",
        `Order ID: ${order.orderId || "N/A"}`,
        `Order Date & Time: ${orderDate}`,
        `Payment Method: ${paymentMethod}`,
        "",
        "Ordered Products:",
        orderedProducts,
        "",
        `Total Amount: ${totalAmount}`,
        "",
        `Delivery Address: ${deliveryAddress}`,
        "",
        "Your order has been received and is currently being processed.",
        "You can track its status anytime, and we will keep you updated as it moves along.",
        "",
        "For support, contact us at:",
        "Email: voltiquehubsupport@gmail.com",
        "Phone: 03063720139",
        "",
        "Thank you for shopping with Voltique Hub!",
    ].join("\n");
};

// Send the "Order Confirmation" email to the customer.
// 'order' is the saved Mongoose order document. The recipient is taken from
// the delivery address (address.email).
const sendOrderConfirmationEmail = async (order) => {
    const address = order.address || {};
    const to = address.email;
    if (!to) {
        throw new Error("Customer email address is missing");
    }
    const subject = "Order Confirmation - Thank You for Your Order";
    const html = buildOrderConfirmationHtml(order);
    const text = buildOrderConfirmationText(order);
    return sendEmail({ to, subject, text, html });
};

export { sendEmail, sendOrderNotificationEmail, sendOrderConfirmationEmail };
