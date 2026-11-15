#!/usr/bin/env python3
"""Explicit operator-run remote smoke. Validates TLS; never bypasses certificate checks."""
import argparse,getpass,http.cookiejar,json,urllib.request,urllib.error
p=argparse.ArgumentParser();p.add_argument('origin');args=p.parse_args()
if not args.origin.startswith('https://'):p.error('A real HTTPS origin is required')
origin=args.origin.rstrip('/');jar=http.cookiejar.CookieJar();opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def call(path,body=None,token=None):
 headers={'Content-Type':'application/json'}
 if token:headers['Authorization']='Bearer '+token
 req=urllib.request.Request(origin+path,data=None if body is None else json.dumps(body).encode(),headers=headers)
 try:
  with opener.open(req,timeout=20) as response:return response.status,response.read()
 except urllib.error.HTTPError as error:return error.code,error.read()
assert call('/')[0]==200 and call('/student/subjects')[0]==200
assert call('/api/auth/me')[0]==401
username=input('Dedicated smoke-test username: ');password=getpass.getpass('Password (not logged): ')
status,body=call('/api/auth/login',{'username':username,'password':password});del password
assert status==200,'Login failed'
token=json.loads(body)['accessToken'];assert call('/api/auth/me',token=token)[0]==200
cookies=list(jar);assert len(cookies)==1 and cookies[0].secure and cookies[0].path=='/api/auth'
assert any(k.lower()=='httponly' for k in cookies[0]._rest)
old=cookies[0].value
assert call('/api/auth/refresh',{})[0]==200
assert list(jar)[0].value!=old
assert call('/api/auth/logout',{})[0]==204 and not list(jar)
assert call('/api/auth/me')[0]==401
print('PASS: verified TLS, frontend, SPA route, API proxy, protected route, login, secure HttpOnly cookie, rotation and logout.')
