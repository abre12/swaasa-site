// Hand-picked Google reviews, shown in the customer home carousel alongside the live ones.
//
// HOW TO ADD ONE (takes a minute):
//  1. Open your listing on Google Maps > Reviews, find a 5-star review you want to feature.
//  2. Copy the reviewer's name and the review text EXACTLY as written. Do not edit the wording.
//  3. Paste a new line in the list below and redeploy.
//
// Rules the site applies (same as the live reviews): only reviews of 11 words or more are shown,
// and a manual review that duplicates a live one is shown once.
// Keep the reviewer's real name so visitors can see these are genuine Google reviews.

export type ManualReview = {
  author: string          // reviewer name as shown on Google
  text: string            // the review, word for word
  when?: string           // optional, e.g. 'October 2026' or '2 months ago'
  url?: string            // optional: link to the review or the reviewer's Google profile
}

export const MANUAL_REVIEWS: ManualReview[] = [
  { author: "Ashli Elizabath Chacko", text: "Recently I purchased a grape wine color lehanga for rent from Swaasa Bridal Rental shop, Trivandrum. It was really amazing, and affordable. No words to describe the look when I wear it on my engagement day. Thank you Swaasa for your beautiful outfit, support and really amazing team who helped me and my family for the end to end process. I'm really happy and my family too. ❤️🫂" },
  { author: "Sashi Kalathil", text: "Had a wonderful experience visiting this place! My friend's daughter rent out a lehenga from here, They have a very beautiful collection of dresses. Every piece is well-maintained and in excellent condition. Definitely worth a visit if you're looking for high end dress in a low budget." },
  { author: "Rohini Devi R", text: "A big thanks to Swaasa for providing such amazing service and beautiful rental outfits at truly affordable rates. These days, most of us look for quality alternatives for event wear since we may not use them again and Swaasa made that possible without compromising on my dream look. I’m so glad I chose their outfit for my special day. I wouldn’t have been able to afford such a gorgeous lehenga if I had gone for a custom one, but Swaasa gave me that experience at a fraction of the price. The staff were also incredibly empathetic, helpful, and caring, which made the entire service smooth and pleasant. I also loved that they offer semi-stitched options at very budget-friendly prices. Overall, I had a wonderful experience with the boutique and would highly recommend Swaasa to anyone looking for stunning yet affordable outfits and rentals." },
  { author: "Littu Mol", text: "Rented my reception outfit from @swaasa wedding rentals and I'm SO glad I did... I wore their maroon lehenga with gold embroidery and felt like an absolute queen. The pics came out stunning and it was even prettier in person. So many compliments all night...🥹❤️ The Swaasa team altered it exactly to my measurements. Quality was 10/10. No stains, no loose threads. It was heavy but surprisingly comfy to wear.💃🏻 The girl Sumayya Super sweet and so helpful🫂 If you're a Tvm bride looking for a rental, don't think twice. Thank you Swaasa Rentals for making me feel so beautiful on our reception night...❤️💯" },
  { author: "Ancy L Mohan", text: "Excellent service! The staff are very cordial and make you feel completely comfortable. The collection and quality of the dresses are far better compared to other shops, and the prices are very reasonable." },
  { author: "Aswathy Asok", text: "We rented a dress from Swasaa and it was absolutely stunning! The fit, the quality, and the elegance were beyond our expectations. Thank you so much, team, for making our day extra special. Your service, timely delivery, and attention to detail truly stood out. Highly recommended for anyone looking for perfect outfits and a hassle-free experience!" },
  { author: "Shajeena Sharafudeen", text: "I had a very good time with swaasa the outfits provided for my events was absolutely fantastic. The staff handled everything perfectly. And I loved the ambiance. For your rentals and customisation visit swaasa they are the masters in this" },
]
