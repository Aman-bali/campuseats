HTTP Request and Response Log
Request 1 — Get Post 1
Request

curl -i https://jsonplaceholder.typicode.com/posts/1

Response
HTTP/2 200 
date: Sat, 15 Aug 2026 04:54:40 GMT
content-type: application/json; charset=utf-8
content-length: 292
access-control-allow-credentials: true
cache-control: max-age=43200
etag: W/"124-yiKdLzqO5gfBrJFrcdJ8Yq0LGnU"
expires: -1
nel: {"report_to":"heroku-nel","response_headers":["Via"],"max_age":3600,"success_fraction":0.01,"failure_fraction":0.1}
pragma: no-cache
report-to: {"group":"heroku-nel","endpoints":[{"url":"https://nel.heroku.com/reports?s=PD3aZ5JXmnXLLbuM9yuy2jwg6ke8U5C2Yq%2BT0erzkj0%3D\u0026sid=e11707d5-02a7-43ef-b45e-2cf4d2036f7d\u0026ts=1775729378"}],"max_age":3600}
reporting-endpoints: heroku-nel="https://nel.heroku.com/reports?s=PD3aZ5JXmnXLLbuM9yuy2jwg6ke8U5C2Yq%2BT0erzkj0%3D&sid=e11707d5-02a7-43ef-b45e-2cf4d2036f7d&ts=1775729378"
server: cloudflare
vary: Origin, Accept-Encoding
via: 2.0 heroku-router
x-content-type-options: nosniff
x-powered-by: Express
x-ratelimit-limit: 1000
x-ratelimit-remaining: 730
x-ratelimit-reset: 1775729393
age: 16164
accept-ranges: bytes
cf-cache-status: HIT
cf-ray: a2b59a46be0da742-SIN
alt-svc: h3=":443"; ma=86400

{
  "userId": 1,
  "id": 1,
  "title": "sunt aut facere repellat provident occaecati excepturi optio reprehenderit",
  "body": "quia et suscipit\nsuscipit recusandae consequuntur expedita et cum\nreprehenderit molestiae ut ut quas totam\nnostrum rerum est autem sunt rem eveniet architecto"
}% 

Annotation
	•	Status: 200 — The request was successful.
	•	Content-Type: application/json — The response contains JSON data.


Request 2 — Get Post 2

Request
curl -i https://jsonplaceholder.typicode.com/posts/2

Response
HTTP/2 200 
date: Sat, 15 Aug 2026 04:57:44 GMT
content-type: application/json; charset=utf-8
content-length: 278
access-control-allow-credentials: true
cache-control: max-age=43200
etag: W/"116-jnDuMpjju89+9j7e0BqkdFsVRjs"
expires: -1
nel: {"report_to":"heroku-nel","response_headers":["Via"],"max_age":3600,"success_fraction":0.01,"failure_fraction":0.1}
pragma: no-cache
report-to: {"group":"heroku-nel","endpoints":[{"url":"https://nel.heroku.com/reports?s=OEU8njcEseoc%2BWQeH%2FjCu8NTvmnyUb3trHBNEFU0v8Q%3D\u0026sid=e11707d5-02a7-43ef-b45e-2cf4d2036f7d\u0026ts=1786302470"}],"max_age":3600}
reporting-endpoints: heroku-nel="https://nel.heroku.com/reports?s=OEU8njcEseoc%2BWQeH%2FjCu8NTvmnyUb3trHBNEFU0v8Q%3D&sid=e11707d5-02a7-43ef-b45e-2cf4d2036f7d&ts=1786302470"
server: cloudflare
vary: Origin, Accept-Encoding
via: 2.0 heroku-router
x-content-type-options: nosniff
x-powered-by: Express
x-ratelimit-limit: 1000
x-ratelimit-remaining: 864
x-ratelimit-reset: 1786302475
age: 3432
accept-ranges: bytes
cf-cache-status: HIT
cf-ray: a2b59ec58a34ffff-AMS
alt-svc: h3=":443"; ma=86400

{
  "userId": 1,
  "id": 2,
  "title": "qui est esse",
  "body": "est rerum tempore vitae\nsequi sint nihil reprehenderit dolor beatae ea dolores neque\nfugiat blanditiis voluptate porro vel nihil molestiae ut reiciendis\nqui aperiam non debitis possimus qui neque nisi nulla"
}%    

Annotation
	•	Status: 200 — The request was successful.
	•	Content-Type: application/json — The response contains JSON data.


Request 3 — Get User 1

Request
curl -i https://jsonplaceholder.typicode.com/users/1

Response
HTTP/2 200 
date: Sat, 15 Aug 2026 04:58:00 GMT
content-type: application/json; charset=utf-8
content-length: 509
access-control-allow-credentials: true
cache-control: max-age=43200
etag: W/"1fd-+2Y3G3w049iSZtw5t1mzSnunngE"
expires: -1
nel: {"report_to":"heroku-nel","response_headers":["Via"],"max_age":3600,"success_fraction":0.01,"failure_fraction":0.1}
pragma: no-cache
report-to: {"group":"heroku-nel","endpoints":[{"url":"https://nel.heroku.com/reports?s=rhdXs%2BRg79xbPE%2FgGfmmmovXjfvbVfct%2F5YiVfSrrfk%3D\u0026sid=e11707d5-02a7-43ef-b45e-2cf4d2036f7d\u0026ts=1786762372"}],"max_age":3600}
reporting-endpoints: heroku-nel="https://nel.heroku.com/reports?s=rhdXs%2BRg79xbPE%2FgGfmmmovXjfvbVfct%2F5YiVfSrrfk%3D&sid=e11707d5-02a7-43ef-b45e-2cf4d2036f7d&ts=1786762372"
server: cloudflare
vary: Origin, Accept-Encoding
via: 2.0 heroku-router
x-content-type-options: nosniff
x-powered-by: Express
x-ratelimit-limit: 1000
x-ratelimit-remaining: 999
x-ratelimit-reset: 1786762390
age: 7507
accept-ranges: bytes
cf-cache-status: HIT
cf-ray: a2b59f26fa11ce51-SIN
alt-svc: h3=":443"; ma=86400

{
  "id": 1,
  "name": "Leanne Graham",
  "username": "Bret",
  "email": "Sincere@april.biz",
  "address": {
    "street": "Kulas Light",
    "suite": "Apt. 556",
    "city": "Gwenborough",
    "zipcode": "92998-3874",
    "geo": {
      "lat": "-37.3159",
      "lng": "81.1496"
    }
  },
  "phone": "1-770-736-8031 x56442",
  "website": "hildegard.org",
  "company": {
    "name": "Romaguera-Crona",
    "catchPhrase": "Multi-layered client-server neural-net",
    "bs": "harness real-time e-markets"
  }
}%                

Annotation
	•	Status: 200 — The request was successful.
	•	Content-Type: application/json — The response contains JSON data.


Request 4 — Get Comment 1

Request
curl -i https://jsonplaceholder.typicode.com/comments/1

Response
HTTP/2 200 
date: Sat, 15 Aug 2026 04:58:09 GMT
content-type: application/json; charset=utf-8
content-length: 268
access-control-allow-credentials: true
cache-control: max-age=43200
etag: W/"10c-KJ4I9RM/+33TKdV8CFsIvqsDSP0"
expires: -1
nel: {"report_to":"heroku-nel","response_headers":["Via"],"max_age":3600,"success_fraction":0.01,"failure_fraction":0.1}
pragma: no-cache
report-to: {"group":"heroku-nel","endpoints":[{"url":"https://nel.heroku.com/reports?s=o5%2FuHtT3N0w4d9DVUFpNJpBQDy2%2Bc%2BBjPYzSZP4dvEY%3D\u0026sid=e11707d5-02a7-43ef-b45e-2cf4d2036f7d\u0026ts=1786752764"}],"max_age":3600}
reporting-endpoints: heroku-nel="https://nel.heroku.com/reports?s=o5%2FuHtT3N0w4d9DVUFpNJpBQDy2%2Bc%2BBjPYzSZP4dvEY%3D&sid=e11707d5-02a7-43ef-b45e-2cf4d2036f7d&ts=1786752764"
server: cloudflare
vary: Origin, Accept-Encoding
via: 2.0 heroku-router
x-content-type-options: nosniff
x-powered-by: Express
x-ratelimit-limit: 1000
x-ratelimit-remaining: 999
x-ratelimit-reset: 1786752790
age: 17125
accept-ranges: bytes
cf-cache-status: HIT
cf-ray: a2b59f611da98228-SIN
alt-svc: h3=":443"; ma=86400

{
  "postId": 1,
  "id": 1,
  "name": "id labore ex et quam laborum",
  "email": "Eliseo@gardner.biz",
  "body": "laudantium enim quasi est quidem magnam voluptate ipsam eos\ntempora quo necessitatibus\ndolor quam autem quasi\nreiciendis et nam sapiente accusantium"
}%            

Annotation
	•	Status: 200 — The request was successful.
	•	Content-Type: application/json — The response contains JSON data.


Request 5 — Deliberate 404

Request
curl -i https://jsonplaceholder.typicode.com/posts/999999

Response
HTTP/2 404 
date: Sat, 15 Aug 2026 04:58:22 GMT
content-type: application/json; charset=utf-8
content-length: 2
access-control-allow-credentials: true
cache-control: max-age=43200
etag: W/"2-vyGp6PvFo4RvsFtPoIWeCReyIC8"
expires: -1
nel: {"report_to":"heroku-nel","response_headers":["Via"],"max_age":3600,"success_fraction":0.01,"failure_fraction":0.1}
pragma: no-cache
report-to: {"group":"heroku-nel","endpoints":[{"url":"https://nel.heroku.com/reports?s=1xNqaj19vaEyHMbow7OoSqDv10eu9yBZfL6mwXBcDBM%3D\u0026sid=e11707d5-02a7-43ef-b45e-2cf4d2036f7d\u0026ts=1786769901"}],"max_age":3600}
reporting-endpoints: heroku-nel="https://nel.heroku.com/reports?s=1xNqaj19vaEyHMbow7OoSqDv10eu9yBZfL6mwXBcDBM%3D&sid=e11707d5-02a7-43ef-b45e-2cf4d2036f7d&ts=1786769901"
server: cloudflare
vary: Origin, Accept-Encoding
via: 2.0 heroku-router
x-content-type-options: nosniff
x-powered-by: Express
x-ratelimit-limit: 1000
x-ratelimit-remaining: 999
x-ratelimit-reset: 1786769923
cf-cache-status: EXPIRED
cf-ray: a2b59fabea89b4cd-SIN
alt-svc: h3=":443"; ma=86400

{}%  
Annotation
	•	Status: 404 — The requested resource was not found.
	•	Content-Type: application/json — The response body is JSON.
	•	Why this request failed: Post 999999 does not exist in the API.
