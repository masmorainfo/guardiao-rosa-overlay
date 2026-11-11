using System;
using Newtonsoft.Json;

public class CPHInline
{
    public bool Execute()
    {
        if (!args.TryGetValue("tokenId", out object rawToken))
        {
            CPH.LogWarn("GUARDIAO Priority End Relay: tokenId ausente.");
            return false;
        }

        string tokenId = Convert.ToString(rawToken);
        if (String.IsNullOrWhiteSpace(tokenId))
        {
            CPH.LogWarn("GUARDIAO Priority End Relay: tokenId vazio.");
            return false;
        }

        string reason = args.TryGetValue("reason", out object rawReason)
            ? Convert.ToString(rawReason)
            : "ended";

        string payload = JsonConvert.SerializeObject(new
        {
            @event = "priorityEnd",
            data = new { tokenId, reason }
        });

        CPH.WebsocketBroadcastJson(payload);
        return true;
    }
}
