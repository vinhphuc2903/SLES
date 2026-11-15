using Microsoft.AspNetCore.RateLimiting;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SLES.Application.Authentication;

namespace SLES.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(IAuthService authService, IWebHostEnvironment environment) : ControllerBase
{
    private const string RefreshCookieName = "sles_refresh_token";

    [AllowAnonymous]
    [HttpPost("login")]
    [EnableRateLimiting("authentication")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
        {
            return Unauthorized(Error("invalid_credentials", "Invalid username or password."));
        }

        var result = await authService.LoginAsync(request, GetIpAddress(), Request.Headers.UserAgent, cancellationToken);
        return ToLoginResponse(result);
    }

    [AllowAnonymous]
    [HttpPost("refresh")]
    [EnableRateLimiting("authentication")]
    public async Task<ActionResult<AuthResponse>> Refresh(CancellationToken cancellationToken)
    {
        if (!Request.Cookies.TryGetValue(RefreshCookieName, out var refreshToken) || string.IsNullOrWhiteSpace(refreshToken))
        {
            return Unauthorized(Error("invalid_refresh_token", "Refresh token is invalid or expired."));
        }

        var result = await authService.RefreshAsync(refreshToken, GetIpAddress(), Request.Headers.UserAgent, cancellationToken);
        if (result.Session is null)
        {
            DeleteRefreshCookie();
        }

        return ToLoginResponse(result);
    }

    [AllowAnonymous]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout(CancellationToken cancellationToken)
    {
        if (Request.Cookies.TryGetValue(RefreshCookieName, out var refreshToken) && !string.IsNullOrWhiteSpace(refreshToken))
        {
            await authService.LogoutAsync(refreshToken, cancellationToken);
        }

        DeleteRefreshCookie();
        return NoContent();
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<CurrentUserResponse>> Me(CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId is null)
        {
            return Unauthorized(Error("invalid_access_token", "Access token is invalid."));
        }

        var user = await authService.GetCurrentUserAsync(userId.Value, cancellationToken);
        return user is null ? Unauthorized(Error("account_unavailable", "Account is unavailable.")) : Ok(user);
    }

    [Authorize]
    [HttpPut("change-password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.CurrentPassword) || string.IsNullOrWhiteSpace(request.NewPassword) || request.NewPassword.Length < 12)
        {
            return BadRequest(Error("invalid_password", "New password must contain at least 12 characters."));
        }

        var userId = GetUserId();
        if (userId is null || !await authService.ChangePasswordAsync(userId.Value, request, cancellationToken))
        {
            return Unauthorized(Error("invalid_credentials", "Current password is invalid."));
        }

        DeleteRefreshCookie();
        return NoContent();
    }

    private ActionResult<AuthResponse> ToLoginResponse(LoginResult result)
    {
        if (result.Session is null)
        {
            return Unauthorized(Error(result.Failure == LoginFailure.InactiveAccount ? "account_inactive" : "invalid_credentials", "Invalid username or password."));
        }

        SetRefreshCookie(result.Session.RefreshToken, result.Session.RefreshTokenExpiresAt);
        return Ok(result.Session.Response);
    }

    private void SetRefreshCookie(string token, DateTimeOffset expiresAt) => Response.Cookies.Append(RefreshCookieName, token, new CookieOptions
    {
        HttpOnly = true,
        Secure = !environment.IsDevelopment(),
        SameSite = SameSiteMode.Lax,
        Path = "/api/auth",
        Expires = expiresAt,
        IsEssential = true
    });

    private void DeleteRefreshCookie() => Response.Cookies.Delete(RefreshCookieName, new CookieOptions { Path = "/api/auth", Secure = !environment.IsDevelopment(), SameSite = SameSiteMode.Lax });
    private string? GetIpAddress() => HttpContext.Connection.RemoteIpAddress?.ToString();
    private Guid? GetUserId() => Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub), out var id) ? id : null;
    private static object Error(string code, string message) => new { error = new { code, message } };
}
